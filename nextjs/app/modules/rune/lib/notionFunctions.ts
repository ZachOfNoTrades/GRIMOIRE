// Fetches a Notion page's content as plain text via the Notion REST API.
// Requires NOTION_API_KEY environment variable (Notion integration token).

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse');

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

function getNotionHeaders(): Record<string, string> {
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    throw new Error('NOTION_API_KEY environment variable is not set');
  }
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

// Extracts a Notion page ID from various URL formats
export function parseNotionPageId(urlOrId: string): string {
  const trimmed = urlOrId.trim();

  // Already a UUID (with or without dashes)
  const uuidPattern = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
  if (uuidPattern.test(trimmed)) {
    return trimmed.replace(/-/g, '');
  }

  // Notion URL: extract the 32-char hex ID from the end
  // Formats: https://www.notion.so/workspace/Page-Title-abc123...
  //          https://notion.so/abc123...
  //          https://myspace.notion.site/Page-Title-abc123...
  const urlMatch = trimmed.match(/([0-9a-f]{32})(?:\?.*)?$/i);
  if (urlMatch) {
    return urlMatch[1];
  }

  // Notion URL with dashed UUID at end
  const dashedMatch = trimmed.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\?.*)?$/i);
  if (dashedMatch) {
    return dashedMatch[1].replace(/-/g, '');
  }

  throw new Error(`Could not parse Notion page ID from: '${trimmed}'`);
}

// Fetches the page title
async function fetchPageTitle(pageId: string): Promise<string> {
  const response = await fetch(`${NOTION_API_BASE}/pages/${pageId}`, {
    headers: getNotionHeaders(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Notion page (${response.status}): ${errorText}`);
  }

  const page = await response.json();

  // Extract title from properties
  const titleProp = Object.values(page.properties as Record<string, any>).find(
    (prop: any) => prop.type === 'title'
  );

  if (titleProp && titleProp.title && titleProp.title.length > 0) {
    return titleProp.title.map((t: any) => t.plain_text).join('');
  }

  return 'Untitled';
}

// Fetches all blocks for a page, recursively fetching children
async function fetchBlocks(blockId: string): Promise<any[]> {
  const allBlocks: any[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL(`${NOTION_API_BASE}/blocks/${blockId}/children`);
    if (cursor) {
      url.searchParams.set('start_cursor', cursor);
    }

    const response = await fetch(url.toString(), {
      headers: getNotionHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch Notion blocks (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    allBlocks.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  // Recursively fetch children for blocks that have them
  for (const block of allBlocks) {
    if (block.has_children) {
      block.children = await fetchBlocks(block.id);
    }
  }

  return allBlocks;
}

// Extracts plain text from a rich_text array
function extractRichText(richText: any[]): string {
  if (!richText || !Array.isArray(richText)) return '';
  return richText.map((rt: any) => rt.plain_text || '').join('');
}

// Downloads a PDF from a signed URL and extracts its text content
async function extractPdfText(pdfUrl: string): Promise<string> {
  const response = await fetch(pdfUrl);

  if (!response.ok) {
    throw new Error(`Failed to download PDF (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const parsed = await pdfParse(buffer);

  return parsed.text.trim();
}

// Returns the downloadable URL from a PDF block, or null if unavailable
function getPdfUrl(block: any): string | null {
  const pdf = block.pdf;
  if (!pdf) return null;

  // Notion-hosted file
  if (pdf.type === 'file' && pdf.file?.url) {
    return pdf.file.url;
  }

  // Externally-hosted file
  if (pdf.type === 'external' && pdf.external?.url) {
    return pdf.external.url;
  }

  return null;
}

// Converts a block tree to readable text
async function blocksToText(blocks: any[], depth: number = 0): Promise<string> {
  const lines: string[] = [];
  const indent = '  '.repeat(depth);

  for (const block of blocks) {
    const type = block.type;

    switch (type) {
      case 'paragraph':
        lines.push(`${indent}${extractRichText(block.paragraph.rich_text)}`);
        break;
      case 'heading_1':
        lines.push(`\n${indent}# ${extractRichText(block.heading_1.rich_text)}`);
        break;
      case 'heading_2':
        lines.push(`\n${indent}## ${extractRichText(block.heading_2.rich_text)}`);
        break;
      case 'heading_3':
        lines.push(`\n${indent}### ${extractRichText(block.heading_3.rich_text)}`);
        break;
      case 'bulleted_list_item':
        lines.push(`${indent}- ${extractRichText(block.bulleted_list_item.rich_text)}`);
        break;
      case 'numbered_list_item':
        lines.push(`${indent}1. ${extractRichText(block.numbered_list_item.rich_text)}`);
        break;
      case 'to_do':
        const checked = block.to_do.checked ? 'x' : ' ';
        lines.push(`${indent}- [${checked}] ${extractRichText(block.to_do.rich_text)}`);
        break;
      case 'toggle':
        lines.push(`${indent}> ${extractRichText(block.toggle.rich_text)}`);
        break;
      case 'code':
        lines.push(`${indent}\`\`\`${block.code.language || ''}`);
        lines.push(`${indent}${extractRichText(block.code.rich_text)}`);
        lines.push(`${indent}\`\`\``);
        break;
      case 'quote':
        lines.push(`${indent}> ${extractRichText(block.quote.rich_text)}`);
        break;
      case 'callout':
        lines.push(`${indent}> ${extractRichText(block.callout.rich_text)}`);
        break;
      case 'divider':
        lines.push(`${indent}---`);
        break;
      case 'table_row':
        const cells = block.table_row.cells.map((cell: any[]) => extractRichText(cell));
        lines.push(`${indent}| ${cells.join(' | ')} |`);
        break;
      case 'pdf': {
        const pdfUrl = getPdfUrl(block);
        if (pdfUrl) {
          try {
            console.log(`[Notion] Extracting text from embedded PDF...`);
            const pdfText = await extractPdfText(pdfUrl);
            if (pdfText.length > 0) {
              lines.push(`\n${indent}[Embedded PDF Content]`);
              lines.push(pdfText);
              lines.push(`${indent}[End of PDF Content]\n`);
              console.log(`[Notion] Extracted ${pdfText.length} chars from PDF`);
            }
          } catch (error) {
            console.warn(`[Notion] Failed to extract PDF text:`, error);
          }
        }
        break;
      }
      default:
        // Skip unsupported block types (images, embeds, etc.)
        break;
    }

    // Process children
    if (block.children && block.children.length > 0) {
      lines.push(await blocksToText(block.children, depth + 1));
    }
  }

  return lines.filter(line => line.length > 0).join('\n');
}

// Main function: fetches a Notion page and returns its content as text
export async function fetchNotionPageContent(notionUrl: string): Promise<{ title: string; content: string }> {
  const pageId = parseNotionPageId(notionUrl);

  console.log(`[Notion] Fetching page: '${pageId}'`);

  const [title, blocks] = await Promise.all([
    fetchPageTitle(pageId),
    fetchBlocks(pageId),
  ]);

  const content = await blocksToText(blocks);

  console.log(`[Notion] Fetched '${title}' — ${content.length} chars, ${blocks.length} top-level blocks`);

  return { title, content: `# ${title}\n\n${content}` };
}
