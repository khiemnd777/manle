import { useLayoutEffect } from 'react';
import './styles.css';
import template from './template.html?raw';
import policyTemplate from './policyTemplate.html?raw';
import { hydrateMuiIcons } from './muiIcons';

function isPolicyPath(pathname: string) {
  return pathname.replace(/\/+$/, '') === '/policy';
}

function isGeneratorPath(pathname: string) {
  return pathname.replace(/\/+$/, '') === '/generator';
}

function setRouteClass(isPolicyRoute: boolean, isGeneratorRoute: boolean) {
  document.body.classList.toggle('route-policy', isPolicyRoute);
  document.body.classList.toggle('route-generator', isGeneratorRoute);
  document.body.classList.toggle('route-home', !isPolicyRoute && !isGeneratorRoute);
}

function scrollToPolicyHash() {
  if (!window.location.hash || window.location.hash === '#') return;

  window.requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>(window.location.hash);
    target?.scrollIntoView({ behavior: 'auto', block: 'start' });
  });
}

function SiteFooter() {
  return (
    <footer className="site-footer" aria-label="Site footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand-block">
          <a className="site-footer-brand" href="/">
            <span className="landing-brand-mark">M</span>
            <span>
              MANLE Card Generator
              <small>IUL & Term Life client cards</small>
            </span>
          </a>
          <p>Create clear, polished client cards ready to share with insurance clients.</p>
        </div>

        <div className="site-footer-map">
          <nav className="site-footer-group" aria-label="Product navigation">
            <span className="site-footer-group-title">Product</span>
            <a href="/"><span className="mui-icon" data-mui-icon="Home" aria-hidden="true"></span>Home</a>
            <a href="/#pricing"><span className="mui-icon" data-mui-icon="Sell" aria-hidden="true"></span>Pricing</a>
            <a href="/generator"><span className="mui-icon" data-mui-icon="PictureAsPdf" aria-hidden="true"></span>Generator</a>
          </nav>

          <nav className="site-footer-group" aria-label="Policy navigation">
            <span className="site-footer-group-title">Policies</span>
            <a href="/policy/#terms"><span className="mui-icon" data-mui-icon="Description" aria-hidden="true"></span>Terms</a>
            <a href="/policy/#privacy"><span className="mui-icon" data-mui-icon="Lock" aria-hidden="true"></span>Privacy</a>
            <a href="/policy/#refund"><span className="mui-icon" data-mui-icon="CheckCircle" aria-hidden="true"></span>Refund</a>
          </nav>

          <address className="site-footer-group site-footer-contact" aria-label="Contact information">
            <span className="site-footer-group-title">Contact</span>
            <a href="tel:+19047504572">(904) 750-4572</a>
            <a href="mailto:manle.support@gmail.com">manle.support@gmail.com</a>
          </address>
        </div>
      </div>

      <div className="site-footer-bottom">
        <span>© 2026 MANLE Insurance</span>
        <span>manle.info</span>
      </div>
    </footer>
  );
}

export function App() {
  const isPolicyRoute = isPolicyPath(window.location.pathname);
  const isGeneratorRoute = isGeneratorPath(window.location.pathname);

  useLayoutEffect(() => {
    setRouteClass(isPolicyRoute, isGeneratorRoute);

    if (isPolicyRoute) {
      hydrateMuiIcons();
      scrollToPolicyHash();
      return;
    }

    void import('./initDomApp').then(({ initDomApp }) => initDomApp());
  }, [isPolicyRoute, isGeneratorRoute]);

  if (isPolicyRoute) {
    return (
      <>
        <header className="landing-nav policy-nav" aria-label="MANLE policy pages">
          <a className="landing-brand" href="/" aria-label="MANLE Card Generator home">
            <span className="landing-brand-mark">M</span>
            <span>MANLE Card Generator</span>
          </a>
          <nav className="landing-nav-links" aria-label="Policy navigation">
            <a href="/"><span className="mui-icon" data-mui-icon="Home" aria-hidden="true"></span>Home</a>
            <a href="/#pricing"><span className="mui-icon" data-mui-icon="Sell" aria-hidden="true"></span>Pricing</a>
            <a href="/policy/#terms"><span className="mui-icon" data-mui-icon="Description" aria-hidden="true"></span>Terms</a>
            <a href="/policy/#privacy"><span className="mui-icon" data-mui-icon="Lock" aria-hidden="true"></span>Privacy</a>
            <a href="/policy/#refund"><span className="mui-icon" data-mui-icon="CheckCircle" aria-hidden="true"></span>Refund</a>
            <a className="landing-nav-cta" href="/generator"><span className="mui-icon" data-mui-icon="PictureAsPdf" aria-hidden="true"></span>Open Generator</a>
          </nav>
        </header>
        <div dangerouslySetInnerHTML={{ __html: policyTemplate }} />
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: template }} />
      <SiteFooter />
    </>
  );
}
