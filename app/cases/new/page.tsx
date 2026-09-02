import { AppHeader } from "@/components/AppHeader";
import { WizardSteps } from "@/components/WizardSteps";
import { CaseIntakeStep1Form } from "@/components/CaseIntakeStep1Form";

export default function NewCasePage() {
  return (
    <div className="flex min-h-full flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">فتح ملف دعوى جديد</h1>
          <p className="text-sm text-muted-foreground">
            المرحلة 1 من 4 — بيانات القضية الأساسية
          </p>
        </div>
        <WizardSteps current={1} />
        <CaseIntakeStep1Form />
      </main>
    </div>
  );
}
