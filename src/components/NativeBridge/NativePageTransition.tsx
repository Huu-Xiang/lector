import * as React from 'react';

type ViewTransitionComponent = React.ComponentType<{
  name?: string;
  children: React.ReactNode;
}>;

/** Next's bundled React exports it; the stable typings do not list it yet. */
const ViewTransition = (React as unknown as { ViewTransition?: ViewTransitionComponent })
  .ViewTransition;

/**
 * Names the page for the route-change slide. The same tree renders on the web and in the app,
 * so hydration never remounts the page; globals.css animates it only under `data-native-app`.
 */
export default function NativePageTransition({ children }: { children: React.ReactNode }) {
  // One host element: a name shared by several siblings aborts the transition.
  const page = <div>{children}</div>;
  return ViewTransition ? <ViewTransition name="native-page">{page}</ViewTransition> : page;
}
