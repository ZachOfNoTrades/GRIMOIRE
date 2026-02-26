type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = ({ children, className = "", ...props }: ButtonProps) => (
    <button
        className={`btn ${className}`}
        {...props}
    >
        {children}
    </button>
);
