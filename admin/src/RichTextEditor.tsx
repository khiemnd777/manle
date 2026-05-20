import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useState } from 'react';
import type { EmailVariable } from './api/client';
import { htmlToText } from './emailText';

type RichTextEditorProps = {
  name: string;
  initialHtml?: string;
  variables: EmailVariable[];
};

export default function RichTextEditor({
  name,
  initialHtml,
  variables,
}: RichTextEditorProps) {
  const [html, setHtml] = useState(initialHtml || '<p></p>');
  const editor = useEditor({
    extensions: [StarterKit],
    content: initialHtml || '<p></p>',
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) => setHtml(currentEditor.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    const nextHtml = initialHtml || '<p></p>';
    editor.commands.setContent(nextHtml);
    setHtml(nextHtml);
  }, [editor, initialHtml]);

  return (
    <div className="rich-editor">
      <input type="hidden" name={name} value={html} readOnly />
      <input type="hidden" name="textBody" value={htmlToText(html)} readOnly />
      <div className="rich-toolbar" aria-label="Editor toolbar">
        <button type="button" className={editor?.isActive('bold') ? 'active' : ''} onClick={() => editor?.chain().focus().toggleBold().run()}>B</button>
        <button type="button" className={editor?.isActive('italic') ? 'active' : ''} onClick={() => editor?.chain().focus().toggleItalic().run()}>I</button>
        <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()}>Bullets</button>
        <button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()}>Numbers</button>
        <button type="button" onClick={() => editor?.chain().focus().undo().run()}>Undo</button>
        <button type="button" onClick={() => editor?.chain().focus().redo().run()}>Redo</button>
      </div>
      {variables.length > 0 && (
        <div className="variable-pills" aria-label="Insert variable">
          {variables.map(variable => (
            <button
              type="button"
              className="ghost-button"
              key={variable.text}
              onClick={() => editor?.chain().focus().insertContent(`{{${variable.text}}}`).run()}
            >
              {variable.label}
            </button>
          ))}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
