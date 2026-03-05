"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";
import { ProgramTemplateSummary } from "../../../types/programTemplate";

export default function GenerateProgramPage() {

  // DATA
  const [templates, setTemplates] = useState<ProgramTemplateSummary[]>([]);

  // INPUT
  const [templateId, setTemplateId] = useState("");

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const router = useRouter();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const templatesResponse = await fetch("/modules/west/api/program-templates");

      if (templatesResponse.ok) {
        const templateData = await templatesResponse.json();
        setTemplates(templateData);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  // Validation check for submit button
  const isFormValid =
    templateId;

  const handleSubmit = async () => {
    if (!isFormValid) return;
    setIsSubmitting(true);
    try {
      const response = await fetch("/modules/west/api/programs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: templateId
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to generate program");
        return;
      }

      const { id } = await response.json();
      toast.success("Program generated");
      router.push(`/modules/west/ui/programs/${id}`);
    } catch (error) {
      console.error("Error generating program:", error);
      toast.error("Failed to generate program");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return (

    // LOADING PLACEHOLDER
    <div className="page">
      <main className="page-container">
        <div className="loading-container py-12">
          <div className="loading-spinner" />
        </div>
      </main>
    </div>
  );

  return (

    // BACKGROUND
    <div className="page">

      <main className="page-container">

        {/* HEADER */}
        <div className="mb-8">

          {/* BACK BUTTON */}
          <Button
            onClick={() => router.push("/modules/west/ui/home")}
            className="btn-link !pl-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Button>

          {/* TITLE */}
          <h1 className="text-page-title">Generate Program</h1>
        </div>

        {/* SCHEDULE CARD */}
        <div className="card mb-6">

          {/* HEADER */}
          <div className="card-header">
            <h2 className="text-card-title">Program</h2>
          </div>

          {/* CARD CONTENT */}
          <div className="card-content">

            {/* TEMPLATE SELECT */}
            <div>
              <label className="text-secondary">Template</label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="input-field w-full"
              >
                <option value="">Select a program...</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* SUBMIT BUTTON */}
        <div className="flex justify-end">
          <Button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={!isFormValid || isSubmitting}
          >
            <Zap className="w-4 h-4" />
            {isSubmitting ? ("Generating...") : "Generate Program"}
          </Button>
        </div>
      </main>
    </div>
  );
}
