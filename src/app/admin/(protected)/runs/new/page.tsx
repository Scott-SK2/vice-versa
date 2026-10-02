import { NewRunForm } from "@/components/admin/NewRunForm";

export default function NewRunPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-3xl">Nouvelle séance</h1>
      <NewRunForm />
    </div>
  );
}
