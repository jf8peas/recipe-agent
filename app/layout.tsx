import type { Metadata } from "next";
import "./tokens.css";

export const metadata: Metadata = {
  title: "Recipe Agent",
  description: "Build a recipe from ingredients, with full time-travel over the agent's history.",
};

// `AppHeader` is rendered by `app/page.tsx` (the app's only route) — it
// owns `usePauseBetweenStages` as its single source of truth and passes it
// down as a controlled prop, rather than the header self-managing a second,
// separate instance of that hook here. Two independent instances kept in
// sync only via a same-tab custom event could and did desync (the header
// showing "on" while `page.tsx`'s own copy still read "off").
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
