import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useState } from 'react';
import type { EmailVariable } from './api/client';
import { htmlToText } from './emailText';
import { Icon } from './icons';

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
        <button type="button" title="Bold" aria-label="Bold" className={editor?.isActive('bold') ? 'active' : ''} onClick={() => editor?.chain().focus().toggleBold().run()}><Icon name="bold" /></button>
        <button type="button" title="Italic" aria-label="Italic" className={editor?.isActive('italic') ? 'active' : ''} onClick={() => editor?.chain().focus().toggleItalic().run()}><Icon name="italic" /></button>
        <button type="button" title="Bulleted list" aria-label="Bulleted list" onClick={() => editor?.chain().focus().toggleBulletList().run()}><Icon name="list" /></button>
        <button type="button" title="Numbered list" aria-label="Numbered list" onClick={() => editor?.chain().focus().toggleOrderedList().run()}><Icon name="listOrdered" /></button>
        <button type="button" title="Undo" aria-label="Undo" onClick={() => editor?.chain().focus().undo().run()}><Icon name="undo" /></button>
        <button type="button" title="Redo" aria-label="Redo" onClick={() => editor?.chain().focus().redo().run()}><Icon name="redo" /></button>
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
