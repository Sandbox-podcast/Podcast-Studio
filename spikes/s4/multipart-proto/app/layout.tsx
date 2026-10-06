import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "S4 multipart proto (prep)",
  description: "Lab-only presigned multipart upload to MinIO",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", margin: "1.5rem", maxWidth: 720 }}>
        {children}
      </body>
    </html>
  );
}
