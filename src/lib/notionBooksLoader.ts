import { Client, isFullPage, collectPaginatedAPI } from '@notionhq/client';
import type { Loader } from 'astro/loaders';
import { pageToBook } from './notionBooks';

export function notionBooksLoader(): Loader {
  return {
    name: 'notion-books-loader',
    async load({ store, logger }) {
      const token = process.env.NOTION_TOKEN;
      const databaseId = process.env.NOTION_BOOKS_DATABASE_ID;

      if (!token || !databaseId) {
        logger.warn('NOTION_TOKEN or NOTION_BOOKS_DATABASE_ID not set — skipping Notion fetch');
        return;
      }

      const notion = new Client({ auth: token });

      let pages;
      try {
        pages = await collectPaginatedAPI(notion.databases.query, {
          database_id: databaseId,
        });
      } catch (err) {
        logger.error(`Failed to query Notion database: ${err}`);
        return;
      }

      store.clear();

      let loadedCount = 0;
      for (const page of pages) {
        if (!isFullPage(page)) continue;

        const book = pageToBook(page);
        if (!book) {
          logger.warn(`Skipping page ${page.id}: missing title or unknown/missing status`);
          continue;
        }

        store.set({
          id: page.id,
          data: book,
          digest: page.last_edited_time,
        });
        loadedCount++;
      }

      logger.info(`Loaded ${loadedCount} books from Notion`);
    },
  };
}
