import type { Metadata } from "next";
import { TenonPreview } from "./tenon-preview";

export const metadata: Metadata = { title: "My Site" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <TenonPreview />
      </body>
    </html>
  );
}
