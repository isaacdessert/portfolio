export type Pos = 'QB' | 'RB' | 'WR' | 'TE' | 'K';

export interface InjuryRow {
  id: string; // entry id (string)
  name: string; // athlete.displayName
  pos: Pos; // PK → 'K'
  team: string; // athlete.team.abbreviation
  status: string; // 'Injured Reserve' → 'IR'; others as given
  injury?: string; // details.type, plus ` (${side})` when side is set and not 'Not Specified'
  returnDate?: string; // details.returnDate
  updated: string; // entry.date
  blurb: string; // shortComment ?? ''
  url?: string; // athlete.links[0].href
}

export const ESPN_INJURIES_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries';

const FANTASY_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'PK']);

function toFantasyPos(abbreviation: string): Pos {
  return abbreviation === 'PK' ? 'K' : (abbreviation as Pos);
}

function toRowStatus(status: string): string {
  return status === 'Injured Reserve' ? 'IR' : status;
}

function buildInjury(details: unknown): string | undefined {
  if (!details || typeof details !== 'object') return undefined;
  const { type, side } = details as { type?: unknown; side?: unknown };
  if (typeof type !== 'string' || type.length === 0) return undefined;
  if (typeof side === 'string' && side.length > 0 && side !== 'Not Specified') {
    return `${type} (${side})`;
  }
  return type;
}

/** Only keep https URLs — never pass through javascript:/data:/etc. hrefs from the feed. */
function toHttpsUrl(href: unknown): string | undefined {
  if (typeof href !== 'string') return undefined;
  try {
    const parsed = new URL(href);
    return parsed.protocol === 'https:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

/** Injured fantasy-relevant players, newest first. Throws if the payload doesn't look like ESPN's format. */
export function parseEspnInjuries(json: unknown): InjuryRow[] {
  if (!json || typeof json !== 'object' || !Array.isArray((json as { injuries?: unknown }).injuries)) {
    throw new Error('Unexpected ESPN injuries format');
  }

  const rows: InjuryRow[] = [];

  for (const teamGroup of (json as { injuries: unknown[] }).injuries) {
    const teamInjuries = (teamGroup as { injuries?: unknown[] } | null)?.injuries;
    if (!Array.isArray(teamInjuries)) continue;

    for (const entry of teamInjuries) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const athlete = e.athlete as Record<string, unknown> | undefined;
      if (!athlete) continue;

      const name = athlete.displayName;
      const positionAbbr = (athlete.position as { abbreviation?: unknown } | undefined)?.abbreviation;
      if (typeof name !== 'string' || typeof positionAbbr !== 'string') continue;
      if (!FANTASY_POSITIONS.has(positionAbbr)) continue;

      const status = e.status;
      if (typeof status !== 'string' || status === 'Active') continue;

      const team = athlete.team as { abbreviation?: unknown } | undefined;
      const links = athlete.links as Array<{ href?: unknown }> | undefined;
      const details = e.details;

      rows.push({
        id: String(e.id),
        name,
        pos: toFantasyPos(positionAbbr),
        team: typeof team?.abbreviation === 'string' ? team.abbreviation : '',
        status: toRowStatus(status),
        injury: buildInjury(details),
        returnDate:
          details && typeof details === 'object' && typeof (details as { returnDate?: unknown }).returnDate === 'string'
            ? (details as { returnDate: string }).returnDate
            : undefined,
        updated: typeof e.date === 'string' ? e.date : '',
        blurb: typeof e.shortComment === 'string' ? e.shortComment : '',
        url: toHttpsUrl(links?.[0]?.href),
      });
    }
  }

  return rows.sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated));
}
