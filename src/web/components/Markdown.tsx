import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  children: string;
  className?: string;
}

export function Markdown({ children, className = '' }: Props) {
  return (
    <div className={`prose prose-invert prose-sm prose-slate max-w-none ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
