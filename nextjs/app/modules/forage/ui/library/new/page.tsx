"use client";

import { useRouter } from "next/navigation";
import { Toaster } from "@/components/Toaster";
import { Food } from "../../../types/food";
import { CreateFoodWizard } from "../../_diary";
import "./createFood.css";

// ============================================================
// CREATE FOOD PAGE — dedicated "New Food" / library "New" entry point. Thin
// wrapper around the shared CreateFoodWizard (the same stepped flow the
// food-logger Add tab embeds). Here it fills the page and, on completion,
// routes to the new food's detail page; cancel returns to the library.
// ============================================================
export default function CreateFoodPage() {
  const router = useRouter();

  // Route to the new food's detail page once it's created.
  function handleCreated(food: Food) {
    router.push(`/modules/forage/ui/library/${food.id}`);
  }

  // Cancel — back to the food library.
  function handleCancel() {
    router.push("/modules/forage/ui/library");
  }

  return (
    /* CREATE FOOD WIZARD — page variant (fills the route, not an overlay). */
    <>
      <CreateFoodWizard onCreated={handleCreated} onCancel={handleCancel} />

      {/* TOAST */}
      <Toaster position="top-center" />
    </>
  );
}
