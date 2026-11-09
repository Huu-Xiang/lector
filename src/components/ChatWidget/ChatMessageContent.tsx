import type { ComponentProps } from 'react';
import Markdown, { type Components } from 'react-markdown';

const COMPONENTS: Components = {
  p: (props) => <p className="my-0" {...omitNode(props)} />,
  h1: Heading,
  h2: Heading,
  h3: Heading,
  h4: Heading,
  h5: Heading,
  h6: Heading,
  ul: (props) => <ul className="my-0 list-disc space-y-1 pl-5" {...omitNode(props)} />,
  ol: (props) => <ol className="my-0 list-decimal space-y-1 pl-5" {...omitNode(props)} />,
  li: (props) => <li className="pl-0.5" {...omitNode(props)} />,
  strong: (props) => <strong className="font-semibold" {...omitNode(props)} />,
  blockquote: (props) => (
    <blockquote
      className="my-0 border-l-2 border-border pl-3 text-muted-foreground"
      {...omitNode(props)}
    />
  ),
  code: (props) => (
    <code
      className="rounded bg-background/60 px-1 py-0.5 font-mono text-[0.85em] break-words"
      {...omitNode(props)}
    />
  ),
  pre: (props) => (
    <pre
      className="my-0 overflow-x-auto rounded bg-background/60 p-2 text-xs [&_code]:bg-transparent [&_code]:p-0"
      {...omitNode(props)}
    />
  ),
  a: (props) => (
    <a
      className="text-primary underline underline-offset-2"
      target="_blank"
      rel="noopener noreferrer"
      {...omitNode(props)}
    />
  ),
  img: ({ alt }) => (alt ? <span>{alt}</span> : null),
  hr: () => <hr className="border-border" />,
};

function omitNode<T extends { node?: unknown }>(props: T): Omit<T, 'node'> {
  const rest = { ...props };
  delete rest.node;
  return rest;
}

function Heading(props: ComponentProps<'p'> & { node?: unknown }) {
  return <p className="my-0 font-semibold" {...omitNode(props)} />;
}

export default function ChatMessageContent({
  role,
  content,
}: {
  role: 'user' | 'assistant';
  content: string;
}) {
  if (role === 'user') {
    return <div className="break-words whitespace-pre-wrap">{content}</div>;
  }
  return (
    <div className="min-w-0 space-y-2 leading-snug break-words" data-testid="chat-markdown">
      <Markdown components={COMPONENTS}>{content}</Markdown>
    </div>
  );
}
