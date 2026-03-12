"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgramTemplateSummary } from "../../types/programTemplate";
import AddTemplateModal from "./AddTemplateModal";

export default function TemplatesPage() {

  // DATA
  const [templates, setTemplates] = useState<ProgramTemplateSummary[]>([]);

  // INPUT
  const [searchTerm, setSearchTerm] = useState("");

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const searchWords = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
  const filteredTemplates = templates.filter((template) => {
    if (searchWords.length === 0) return true;
    const normalizedName = template.name.toLowerCase();
    return searchWords.every((word) => normalizedName.includes(word));
  });

  const router = useRouter();

  // LOAD DATA
  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/modules/golem/api/program-templates");
      if (!response.ok) {
        throw new Error("Failed to fetch templates");
      }
      const data = await response.json();
      setTemplates(data);
    } catch (error) {
      console.error("Error fetching templates:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (

    // BACKGROUND
    <div className="page">

      <main className="page-container">

        {/* HEADER */}
        <div className="mb-8">

          {/* BACK BUTTON */}
          <Button
            onClick={() => router.push("/modules/golem/ui/home")}
            className="btn-link !pl-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Button>

          {/* TITLE */}
          <div>
            <h1 className="text-page-title">Program Templates</h1>
          </div>
        </div>

        {/* TEMPLATES CARD */}
        <div className="card">

          {/* CARD HEADER */}
          <div className="card-header">

            {/* TITLE */}
            <h2 className="text-card-title">
              <FileText className="w-5 h-5" />
              Templates
            </h2>

            {/* ACTIONS */}
            <div className="flex items-center gap-2">

              {/* SEARCH BAR */}
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field"
              />

              {/* ADD BUTTON */}
              <Button
                onClick={() => setIsAddModalOpen(true)}
                className="btn-blue"
              >
                <Plus className="w-4 h-4" />
                <span>Add</span>
              </Button>
            </div>
          </div>

          {/* TABLE */}
          <div className="table-container min-h-[15rem] max-h-[calc(100vh-20rem)]">
            <table className="table">

              {/* TABLE HEADERS */}
              <thead className="table-header">
                <tr className="table-header-row">
                  <th className="table-header-cell">Name</th>
                  <th className="table-header-cell">Description</th>
                </tr>
              </thead>

              {/* TABLE ROWS */}
              <tbody className="table-body">

                {isLoading ? (

                  // LOADING PLACEHOLDER
                  <tr>
                    <td colSpan={2} className="table-empty">
                      <div className="loading-container">
                        <div className="loading-spinner" />
                      </div>
                    </td>
                  </tr>
                ) : templates.length === 0 ? (

                  // NO RECORDS FOUND WARNING
                  <tr>
                    <td colSpan={2} className="table-empty">No templates found</td>
                  </tr>
                ) : filteredTemplates.length === 0 ? (

                  // NO SEARCH RESULTS FOUND WARNING
                  <tr>
                    <td colSpan={2} className="table-empty">No templates match search criteria</td>
                  </tr>
                ) : (

                  // RECORDS MAP
                  filteredTemplates.map((template) => (

                    // TABLE ROW
                    <tr
                      key={template.id}
                      className="table-row-clickable"
                      onClick={() => router.push(`/modules/golem/ui/templates/${template.id}`)}
                    >
                      <td className="table-cell">{template.name}</td>
                      <td className="table-cell text-secondary">{template.description || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* SUMMARY */}
          {!isLoading && templates.length > 0 && (
            <div className="text-secondary text-center mt-4">
              Showing {filteredTemplates.length} of {templates.length} templates
            </div>
          )}
        </div>

        {/* ADD TEMPLATE MODAL */}
        <AddTemplateModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onSaved={fetchTemplates}
        />
      </main>
    </div>
  );
}
