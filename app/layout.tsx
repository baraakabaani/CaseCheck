import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { DirectionProvider } from "@/components/ui/direction";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const fontSans = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "تدقيق ملفات الدعاوى | نظام مراجعة المستندات الذكي",
  description:
    "منصة لتدقيق ملفات الدعاوى القضائية والخبرة المحاسبية، ومطابقة المستندات المرفوعة مع المتطلبات باستخدام الذكاء الاصطناعي.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${fontSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <DirectionProvider dir="rtl">
          <TooltipProvider>
            {children}
            <Toaster richColors position="top-center" dir="rtl" />
          </TooltipProvider>
        </DirectionProvider>
      </body>
    </html>
  );
}
