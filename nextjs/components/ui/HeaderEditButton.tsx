import { Pencil } from "lucide-react";
import { Button } from "./button";

type HeaderEditButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className">;

// The one Edit on a page or record header: filled blue, the pencil and the word "Edit". Rows,
// cards and list items edit with an icon-only button instead; this one is for headers only.
export const HeaderEditButton = (props: HeaderEditButtonProps) => (
    <Button className="btn-blue" {...props}>
        <Pencil className="w-4 h-4" aria-hidden /> Edit
    </Button>
);
