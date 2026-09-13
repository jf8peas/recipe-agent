import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import "./tokens.css";

export const metadata: Metadata = {
  title: "Recipe Agent",
  description: "Build a recipe from ingredients, with full time-travel over the agent's history.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
