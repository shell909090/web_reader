import type { Item } from '../types.ts';

type BskyEmbed = {
  $type: string;
  external?: {
    uri: string;
    title?: string;
    description?: string;
  };
};

type BskyRecord = {
  text: string;
  createdAt?: string;
  embed?: BskyEmbed;
};

type BskyPost = {
  uri: string;
  author: { handle: string; displayName?: string };
  record: BskyRecord;
  likeCount?: number;
  repostCount?: number;
  indexedAt?: string;
};

export type AuthorFeedResponse = {
  feed: Array<{ post: BskyPost }>;
};

export type SearchPostsResponse = {
  posts: BskyPost[];
};

function postLink(post: BskyPost): { title: string; url: string } {
  const external = post.record.embed?.external;
  if (external?.uri) {
    return { title: (external.title ?? post.record.text).slice(0, 100).trim(), url: external.uri };
  }
  const rkey = post.uri.split('/').pop();
  return {
    title: post.record.text.slice(0, 100).trim(),
    url: rkey ? `https://bsky.app/profile/${post.author.handle}/post/${rkey}` : '',
  };
}

function postNotes(post: BskyPost, date: string): string {
  const parts = [post.author.displayName ?? post.author.handle ?? 'Bluesky'];
  if (date) parts.push(date);
  if (post.likeCount !== undefined) parts.push(`${post.likeCount} likes`);
  if (post.repostCount !== undefined) parts.push(`${post.repostCount} reposts`);
  return parts.join(' · ');
}

export function postToItem(post: BskyPost): Item | null {
  const { title, url } = postLink(post);
  if (!title || !url) return null;
  const date = (post.indexedAt ?? post.record.createdAt ?? '').slice(0, 10);
  return {
    source: 'bsky',
    title,
    url,
    notes: postNotes(post, date),
    published_at: date || undefined,
  };
}
