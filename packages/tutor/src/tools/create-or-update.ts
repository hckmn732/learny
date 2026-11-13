import { accessibleFormation, inFormation } from './guard-helpers';
import { CreateOrUpdateInput, CreateOrUpdateOutput, TOOL_NAMES } from './schemas';
import { ALLOW, defineTutorTool, notFound, refuse } from './types';

/**
 * ai.md §3 — creates or updates a structure object or a brick. The payload is validated by Zod,
 * then by `validateBrick` for a brick; a modification of a brick creates a new immutable version.
 */
export const createOrUpdateTool = defineTutorTool({
  name: TOOL_NAMES.createOrUpdate,
  description:
    'Create or update a module, chapter, notion, notion link, or brick. A brick is validated by its SPEC-501 schema and common rules; an update of a brick requires its expected version and creates a new immutable version.',
  inputSchema: CreateOrUpdateInput,
  outputSchema: CreateOrUpdateOutput,
  async guard(ctx, input) {
    const formationId = await accessibleFormation(ctx, input.formationId);
    if (formationId === null) return notFound();
    const data = input.data;
    if (data.kind === 'module') {
      if (input.action === 'create') return ALLOW;
      const module = await ctx.runtime.module(ctx, input.targetId as string);
      return module !== null && inFormation(module, formationId) ? ALLOW : notFound();
    }
    if (data.kind === 'chapter') {
      const module = await ctx.runtime.module(ctx, data.moduleId);
      if (module === null || !inFormation(module, formationId)) return notFound();
      if (input.action === 'create') return ALLOW;
      const chapter = await ctx.runtime.chapter(ctx, input.targetId as string);
      return chapter !== null && inFormation(chapter, formationId) ? ALLOW : notFound();
    }
    if (data.kind === 'notion') {
      const chapter = await ctx.runtime.chapter(ctx, data.chapterId);
      if (chapter === null || !inFormation(chapter, formationId)) return notFound();
      if (input.action === 'create') return ALLOW;
      const notion = await ctx.runtime.notion(ctx, input.targetId as string);
      return notion !== null && inFormation(notion, formationId) ? ALLOW : notFound();
    }
    if (data.kind === 'notion_link') {
      if (input.action === 'update') {
        return refuse('VALIDATION_FAILED', 'Un lien de notion ne se met pas à jour.');
      }
      const from = await ctx.runtime.notion(ctx, data.fromNotionId);
      const to = await ctx.runtime.notion(ctx, data.toNotionId);
      return from !== null &&
        to !== null &&
        inFormation(from, formationId) &&
        inFormation(to, formationId)
        ? ALLOW
        : notFound();
    }
    if (data.draft.formationId !== formationId) return notFound();
    for (const notionId of data.draft.notionIds) {
      const notion = await ctx.runtime.notion(ctx, notionId);
      if (notion === null || !inFormation(notion, formationId)) return notFound();
    }
    if (input.action === 'create') return ALLOW;
    const brick = await ctx.runtime.brick(ctx, input.targetId as string);
    if (brick === null || brick.formationId !== formationId) return notFound();
    if (brick.status === 'retired') {
      return refuse('BRICK_RETIRED', 'Cette brique a été retirée.');
    }
    if (
      input.expectedVersion !== undefined &&
      input.expectedVersion !== brick.currentVersion
    ) {
      return refuse('CONFLICT', 'La brique a été modifiée entre-temps.');
    }
    return ALLOW;
  },
  async execute(ctx, input) {
    return ctx.runtime.writeStructure(ctx, input);
  },
});
