/** Small inline busy indicator; the accessible label lives on the surrounding control. */
export default function Spinner({ className = '' }: { className?: string }) {
  return (
    <span className={`spinner${className === '' ? '' : ` ${className}`}`} aria-hidden="true" />
  );
}
