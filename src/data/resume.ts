export const skills: Record<string, string[]> = {
  'Languages': ['TypeScript', 'JavaScript', 'Python', 'Go', 'SQL', 'Kotlin'],
  'Frontend': ['React', 'Astro', 'Next.js', 'Tailwind CSS'],
  'Backend': ['Node.js', 'Java', 'Spring', 'PostgreSQL', 'Redis', 'MongoDB'],
  'DevOps': ['Docker', 'Kubernetes', 'AWS', 'Terraform', 'Ansible'],
  'Tools': ['Git', 'GitHub', 'GitLab', 'Shell', 'Claude Code', 'Gemini CLI', 'Junie', 'IntelliJ'],
};

export interface Job {
  title: string;
  company: string;
  period: string;
  description: string;
  highlights: string[];
}

export const experience: Job[] = [
  {
    title: 'Lead Software Engineer',
    company: 'Shipium',
    period: 'Aug 2025 — Present',
    description: 'Lead a team owning the core platform domain — a large surface area spanning external-facing APIs, customer-facing UI, internal tooling, and foundational internal systems. Drive architecture decisions, technical roadmap, and cross-team coordination while staying hands-on with delivery.',
    highlights: [
      'Spearheaded a new document generation product — shipped ahead of schedule with capabilities beyond initial MVP scope',
      'Designed a carrier configuration architecture decoupling credentials and accounts, improving API ergonomics and extensibility',
      'Re-architected a billing system using S3 pre-signed URLs and webhooks to support volume growth',
    ],
  },
  {
    title: 'Senior Software Engineer',
    company: 'Shipium',
    period: 'Apr 2024 — Aug 2025',
    description: 'Contributed across the core platform as a senior individual contributor, owning performance, reliability, and feature delivery across a system with broad reach — external APIs, customer and internal UIs, and core infrastructure.',
    highlights: [
      'Led a data and underlying service migration that decreased latency ~90% across all percentiles for 23 internal APIs with zero production disruption',
      'Reduced core API latency ~50% across all percentiles, nearly halving service memory usage',
      'Delivered a complex fulfillment feature on time despite rapidly changing late-stage requirements, coordinating across multiple teams',
      'Led a carrier onboarding with extensive support for non-standard edge cases beyond typical integrations',
    ],
  },
  {
    title: 'Software Engineer',
    company: 'Shipium',
    period: 'Aug 2022 — Apr 2024',
    description: 'Built and shipped core platform features across carrier integrations, partner management, and billing.',
    highlights: [
      'Saved ~$60,000/year by migrating and pruning observability metrics infrastructure',
      'Eliminated 6,000+ lines of code by introducing an abstract controller pattern for a partner management API',
      'Halved deployment time by identifying and eliminating duplicate CI test runs',
      'Delivered a configurable customer-facing API enabling self-service management of shipping options',
      'Shipped a billing feature comprising ~8,000 lines of code across 3 weeks',
      'Led a project enabling shipments to be initiated from any origin location via API',
    ],
  },
  {
    title: 'Software Engineer',
    company: 'GameStop',
    period: 'Dec 2021 — Jul 2022',
    description: 'Planned, led, and developed scalable microservices alongside a growing engineering team.',
    highlights: [
      'Led microservice projects extracting, transforming, and loading 60,000+ records',
      'Defined epics and delivered two data transfer projects handling vendor and store data across 1,500+ records',
      'Drove process improvements and iterated on shared libraries and infrastructure scripts across teams',
      'Created 40+ pages of documentation across multiple projects and troubleshooting efforts',
    ],
  },
  {
    title: 'Software Engineer',
    company: 'Dynatrace',
    period: 'May 2020 — Nov 2021',
    description: 'Built and maintained software within a large-scale observability and application performance monitoring platform.',
    highlights: [
      'Delivered the first blue/green deployment pipeline solution for the platform',
      'Built a centralized event broker service enabling any Java service in the ecosystem to publish and subscribe to Kafka events',
      'Supported and contributed to the Kubernetes platform infrastructure',
    ],
  },
];

export const education = {
  degree: 'B.S. Computer Science',
  school: 'Grand Valley State University',
  year: '2020',
};

export const contact = {
  email: 'isaacjdessert@gmail.com',
  github: 'https://github.com/isaacdessert',
  linkedin: 'https://linkedin.com/in/isaacdessert',
};
