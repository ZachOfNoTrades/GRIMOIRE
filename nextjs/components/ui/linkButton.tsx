"use client";

import Link from "next/link";

type LinkButtonProps = React.ComponentPropsWithoutRef<typeof Link>;

// LINK BUTTON — a button-shaped control whose job is purely "go to this page".
//
// Same `.btn` styling as <Button>, but rendered as a real anchor so the browser
// handles middle-click / cmd-click / "Open in new tab" natively. A
// <button onClick={() => router.push(...)}> gets none of those: the middle
// button never produces a click event, so the gesture silently does nothing.
// Use <Button> for anything that acts on the page instead of navigating.
export const LinkButton = ({ children, className = "", ...props }: LinkButtonProps) => (
    <Link
        className={`btn ${className}`}
        {...props}
    >
        {children}
    </Link>
);

export default LinkButton;
