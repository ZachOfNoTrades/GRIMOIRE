import { NextRequest, NextResponse } from 'next/server';
import { getProgramTemplateById, updateProgramTemplate, deleteProgramTemplate } from '../../../lib/programTemplateFunctions';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const template = await getProgramTemplateById(id);
    return NextResponse.json(template);

  } catch (error) {
    console.error('Error in GET /api/program-templates/[id]:', error);

    if (error instanceof Error && error.message.includes('No program template found')) {
      return NextResponse.json(
        { error: 'Program template not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch program template' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { name, description, program_prompt, week_prompt, session_prompt, analysis_prompt, days_per_week } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Template name is required' },
        { status: 400 }
      );
    }

    const template = await updateProgramTemplate(
      id,
      name.trim(),
      description?.trim() || null,
      program_prompt || null,
      week_prompt || null,
      session_prompt || null,
      analysis_prompt || null,
      days_per_week ?? 4,
    );
    return NextResponse.json(template);

  } catch (error) {
    console.error('Error in PUT /api/program-templates/[id]:', error);

    if (error instanceof Error && error.message.includes('No program template found')) {
      return NextResponse.json(
        { error: 'Program template not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update program template' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    await deleteProgramTemplate(id);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Error in DELETE /api/program-templates/[id]:', error);

    if (error instanceof Error && error.message.includes('No program template found')) {
      return NextResponse.json(
        { error: 'Program template not found' },
        { status: 404 }
      );
    }

    // FK constraint violation (template in use by a program)
    if (error?.number === 547) {
      return NextResponse.json(
        { error: 'Template is in use by one or more programs' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to delete program template' },
      { status: 500 }
    );
  }
}
