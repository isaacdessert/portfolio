import type { Layer } from '@deck.gl/core';
import type { EraSkin } from './skins';

export interface StoryState {
  year: number;
  skin: EraSkin;
  phase: '2d' | '3d';
  depth: number;
}

export interface TimelineEvent {
  date: string;
  year: number;
  text: string;
  focus?: string;
}

export interface Legend {
  title: string;
  items: { label: string; size?: number; color?: string }[];
}

export interface DataLayer<D = unknown> {
  id: string;
  load(): Promise<D>;
  render(data: D, s: StoryState): Layer[];
  legend?(data: D, s: StoryState): Legend | null;
  events?(data: D): TimelineEvent[];
}
