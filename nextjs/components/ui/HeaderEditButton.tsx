import { Pencil } from "lucide-react";
import { Button } from "./button";

type HeaderEditButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">;

// The one Edit on a page or record header: filled blue, the pencil and the word "Edit". Rows,
// cards and list items edit with an icon-only button instead; this one is for headers only.
// Append layout classes (e.g. width) after the fixed blue style
export const HeaderEditButton = ({ className = "", ...props }: HeaderEditButtonProps) => (
    <Button className={`btn-blue ${className}`.trim()} {...props}>
        <Pencil className="w-4 h-4" aria-hidden /> Edit
    </Button>
);
