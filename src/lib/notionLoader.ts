import { Client, isFullPage, collectPaginatedAPI, type QueryDataSourceResponse } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import { marked } from 'marked';
import { toSlug } from './slug';
import type { Loader } from 'astro/loaders';

export function notionLoader(): Loader {
  return {
    name: 'notion-loader',
    async load({ store, logger }) {
      const token = process.env.NOTION_TOKEN;
      const databaseId = process.env.NOTION_DATABASE_ID;

      if (!token || !databaseId) {
        logger.warn('NOTION_TOKEN or NOTION_DATABASE_ID not set — skipping Notion fetch');
        return;
      }

      const notion = new Client({ auth: token });
      const n2m = new NotionToMarkdown({ notionClient: notion });

      // collectPaginatedAPI generic constraint is too narrow for dataSources.query
      // (which requires data_source_id in path params), so we cast to a compatible
      // paginated function signature that accepts the full args.
      // Tested with @notionhq/client@5.20.0 — revisit if upgrading the SDK.
      type PaginatedQueryArgs = { data_source_id: string; filter?: unknown; start_cursor?: string };
      type PaginatedQueryFn = (args: PaginatedQueryArgs) => Promise<QueryDataSourceResponse>;
      const pages = await collectPaginatedAPI(
        notion.dataSources.query.bind(notion.dataSources) as PaginatedQueryFn,
        {
          data_source_id: databaseId,
          filter: {
            property: 'Status',
            select: { equals: 'Published' },
          },
        }
      );

      if (pages.length === 0) {
        logger.info('No published posts found in Notion');
        return;
      }

      store.clear();

      let loadedCount = 0;
      for (const page of pages) {
        if (!isFullPage(page)) continue;

        const nameProp = page.properties['Name'];
        const title =
          nameProp?.type === 'title'
            ? nameProp.title.map((t) => t.plain_text).join('') || 'Untitled'
            : 'Untitled';

        const dateProp = page.properties['Date'];
        const dateStr =
          dateProp?.type === 'date' && dateProp.date?.start
            ? dateProp.date.start
            : new Date().toISOString().split('T')[0];

        const tagsProp = page.properties['Tags'];
        const tags =
          tagsProp?.type === 'multi_select' ? tagsProp.multi_select.map((t) => t.name) : [];

        const excerptProp = page.properties['Excerpt'];
        const excerpt =
          excerptProp?.type === 'rich_text'
            ? excerptProp.rich_text.map((t) => t.plain_text).join('')
            : '';

        const slug = toSlug(title);

        if (store.get(slug)) {
          logger.warn(`Slug collision: "${slug}" already exists. Skipping duplicate page ${page.id}.`);
          continue;
        }

        let mdBlocks;
        try {
          mdBlocks = await n2m.pageToMarkdown(page.id);
        } catch (err) {
          logger.error(`Failed to fetch blocks for page "${title}" (${page.id}): ${err}`);
          continue;
        }
        const { parent: body } = n2m.toMarkdownString(mdBlocks);

        const html = await marked(body);

        store.set({
          id: slug,
          data: {
            title,
            date: new Date(dateStr),
            tags,
            excerpt,
            draft: false,
          },
          body,
          rendered: {
            html,
            metadata: { headings: [], imagePaths: [] },
          },
          digest: page.last_edited_time,
        });
        loadedCount++;
      }

      logger.info(`Loaded ${loadedCount} posts from Notion`);
    },
  };
}
