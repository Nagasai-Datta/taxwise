import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TaxWise",
  description: "A conversational platform for financial literacy and management using a multi-agent LLM orchestrator.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body className="antialiased">{children}</body></html>);
}
