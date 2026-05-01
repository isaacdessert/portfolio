import { Client, isFullPage } from '@notionhq/client';
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

      const response = await notion.dataSources.query({
        data_source_id: databaseId,
        filter: {
          property: 'Status',
          select: { equals: 'Published' },
        },
      });

      store.clear();

      for (const page of response.results) {
        if (!isFullPage(page)) continue;

        const nameProp = page.properties['Name'];
        const title =
          nameProp?.type === 'title' ? (nameProp.title[0]?.plain_text ?? 'Untitled') : 'Untitled';

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
            ? (excerptProp.rich_text[0]?.plain_text ?? '')
            : '';

        const slug = toSlug(title);

        const mdBlocks = await n2m.pageToMarkdown(page.id);
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
        });
      }

      logger.info(`Loaded ${response.results.length} posts from Notion`);
    },
  };
}
