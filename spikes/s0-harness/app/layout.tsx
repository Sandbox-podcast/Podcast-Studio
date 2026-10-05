import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Podcast Studio — S0 spike",
  description: "Google Sign-In + mock roles (spike harness only)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: "2rem" }}>
        {children}
      </body>
    </html>
  );
}
