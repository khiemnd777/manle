import { useLayoutEffect } from 'react';
import template from './template.html?raw';
import { initDomApp } from './initDomApp';

export function App() {
  useLayoutEffect(() => {
    initDomApp();
  }, []);

  return <div dangerouslySetInnerHTML={{ __html: template }} />;
}
