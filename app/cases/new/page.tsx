import { AppHeader } from "@/components/AppHeader";
import { CaseForm } from "@/components/CaseForm";

export default function NewCasePage() {
  return (
    <div className="flex min-h-full flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">إنشاء ملف دعوى جديد</h1>
          <p className="text-sm text-muted-foreground">
            أدخل بيانات الدعوى وحدد قائمة المستندات المطلوبة لبدء عملية التدقيق
          </p>
        </div>
        <CaseForm />
      </main>
    </div>
  );
}
