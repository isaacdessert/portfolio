/** Single source for the static pages' titles/descriptions (also feeds their OG cards). */
export const pageMeta = {
  about: {
    title: 'About',
    description: 'About Isaac Dessert — Lead Software Engineer. Resume, skills, and experience.',
  },
  projects: {
    title: 'Projects',
    description: 'Open source projects and past work by Isaac Dessert.',
  },
  blog: {
    title: 'Blog',
    description: 'Writing by Isaac Dessert on engineering, systems, and team leadership.',
  },
  reading: {
    title: 'Reading',
    description: 'Books Isaac Dessert is reading, has read, and wants to read.',
  },
  lab: {
    title: 'Lab',
    description: 'Small experiments, toys, and tools Isaac has shipped.',
  },
} as const;
