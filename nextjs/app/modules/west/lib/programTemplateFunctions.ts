import { getWestConnection, closeWestConnection } from './db';
import { ProgramTemplate, ProgramTemplateSummary } from '../types/programTemplate';

export async function getAllProgramTemplates(): Promise<ProgramTemplateSummary[]> {
  let pool;
  try {
    pool = await getWestConnection();
    const result = await pool.request().query(`
      SELECT id, name, description, created_at, modified_at
      FROM program_templates
      ORDER BY name
    `);

    if (result.recordset.length === 0) {
      console.warn('No program templates found');
    }

    return result.recordset;
  } catch (error) {
    console.error('Error fetching program templates:', error);
    throw error;
  } finally {
    if (pool) {
      await closeWestConnection(pool);
    }
  }
}

export async function getProgramTemplateById(templateId: string): Promise<ProgramTemplate> {
  let pool;
  try {
    pool = await getWestConnection();
    const result = await pool.request()
      .input('templateId', templateId)
      .query(`SELECT * FROM program_templates WHERE id = @templateId`);

    if (result.recordset.length === 0) {
      throw new Error(`No program template found for id: '${templateId}'`);
    }

    return result.recordset[0];
  } catch (error) {
    console.error('Error fetching program template:', error);
    throw error;
  } finally {
    if (pool) {
      await closeWestConnection(pool);
    }
  }
}

export async function createProgramTemplate(
  name: string,
  description: string | null,
  programPrompt: string | null,
  weekPrompt: string | null,
  sessionPrompt: string | null,
  daysPerWeek: number,
): Promise<ProgramTemplate> {
  let pool;
  try {
    pool = await getWestConnection();
    const result = await pool.request()
      .input('name', name)
      .input('description', description)
      .input('programPrompt', programPrompt)
      .input('weekPrompt', weekPrompt)
      .input('sessionPrompt', sessionPrompt)
      .input('daysPerWeek', daysPerWeek)
      .query(`
        INSERT INTO program_templates (name, description, program_prompt, week_prompt, session_prompt, days_per_week)
        OUTPUT INSERTED.*
        VALUES (@name, @description, @programPrompt, @weekPrompt, @sessionPrompt, @daysPerWeek)
      `);

    return result.recordset[0];
  } catch (error) {
    console.error('Error creating program template:', error);
    throw error;
  } finally {
    if (pool) {
      await closeWestConnection(pool);
    }
  }
}

export async function updateProgramTemplate(
  templateId: string,
  name: string,
  description: string | null,
  programPrompt: string | null,
  weekPrompt: string | null,
  sessionPrompt: string | null,
  daysPerWeek: number,
): Promise<ProgramTemplate> {
  let pool;
  try {
    pool = await getWestConnection();
    const result = await pool.request()
      .input('templateId', templateId)
      .input('name', name)
      .input('description', description)
      .input('programPrompt', programPrompt)
      .input('weekPrompt', weekPrompt)
      .input('sessionPrompt', sessionPrompt)
      .input('daysPerWeek', daysPerWeek)
      .query(`
        UPDATE program_templates
        SET name = @name, description = @description,
            program_prompt = @programPrompt,
            week_prompt = @weekPrompt, session_prompt = @sessionPrompt,
            days_per_week = @daysPerWeek,
            modified_at = GETDATE()
        OUTPUT INSERTED.*
        WHERE id = @templateId
      `);

    if (result.recordset.length === 0) {
      throw new Error(`No program template found for id: '${templateId}'`);
    }

    return result.recordset[0];
  } catch (error) {
    console.error('Error updating program template:', error);
    throw error;
  } finally {
    if (pool) {
      await closeWestConnection(pool);
    }
  }
}

export async function deleteProgramTemplate(templateId: string): Promise<void> {
  let pool;
  try {
    pool = await getWestConnection();
    const result = await pool.request()
      .input('templateId', templateId)
      .query(`DELETE FROM program_templates WHERE id = @templateId`);

    if (result.rowsAffected[0] === 0) {
      throw new Error(`No program template found for id: '${templateId}'`);
    }
  } catch (error) {
    console.error('Error deleting program template:', error);
    throw error;
  } finally {
    if (pool) {
      await closeWestConnection(pool);
    }
  }
}
