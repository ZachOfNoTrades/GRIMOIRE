import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/permissions';
import { getAllProgramTemplates, createProgramTemplate } from '../../lib/programTemplateFunctions';

export async function GET() {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const templates = await getAllProgramTemplates(userId!);
    return NextResponse.json(templates);

  } catch (error) {
    console.error('Error in GET /api/program-templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch program templates' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await request.json();
    const { name, description, program_prompt, week_prompt, session_prompt, analysis_prompt, days_per_week } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Template name is required' },
        { status: 400 }
      );
    }

    const template = await createProgramTemplate(
      userId!,
      name.trim(),
      description?.trim() || null,
      program_prompt || null,
      week_prompt || null,
      session_prompt || null,
      analysis_prompt || null,
      days_per_week ?? 4,
    );
    return NextResponse.json(template, { status: 201 });

  } catch (error) {
    console.error('Error in POST /api/program-templates:', error);
    return NextResponse.json(
      { error: 'Failed to create program template' },
      { status: 500 }
    );
  }
}
