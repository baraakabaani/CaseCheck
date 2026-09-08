-- إضافة بنود "أخرى" حرة (عدد غير محدود) على طبيعة المأمورية الحسابية،
-- منفصلة عن الخيارات الثابتة في mandateNature.
ALTER TABLE "Case" ADD COLUMN "mandateNatureOther" TEXT;
