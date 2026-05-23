import { useLayoutEffect } from 'react';
import './styles.css';
import template from './template.html?raw';
import policyTemplate from './policyTemplate.html?raw';
import { hydrateMuiIcons } from './muiIcons';

const SITE_ORIGIN = 'https://manle.info';

type SeoRoute = {
  path: string;
  title: string;
  description: string;
  image: string;
};

const HOME_SEO: SeoRoute = {
  path: '/',
  title: 'MANLE Card Generator | Life Insurance Card Generator',
  description:
    'MANLE Card Generator helps life insurance agents create IUL and Term Life client cards, auto-fill illustration PDFs, customize branding, and export PDF/PNG/JPG.',
  image: '/android-chrome-512x512.png',
};

const GENERATOR_SEO: SeoRoute = {
  path: '/generator',
  title: 'MANLE Generator | Build IUL & Term Life Insurance Cards',
  description:
    'Open the MANLE insurance card generator to build IUL and Term Life client cards with PDF auto-fill, agency branding, and PDF, PNG, or JPG export.',
  image: '/android-chrome-512x512.png',
};

const POLICY_SEO: SeoRoute = {
  path: '/policy',
  title: 'MANLE Card Generator Policies | Terms, Privacy, Refunds',
  description:
    'Read MANLE Card Generator terms, privacy policy, and refund policy for the IUL and Term Life insurance card generator.',
  image: '/android-chrome-512x512.png',
};

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

function absoluteSiteUrl(path: string) {
  return new URL(path, SITE_ORIGIN).toString();
}

function upsertMeta(selector: string, createAttributes: Record<string, string>, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(selector);

  if (!tag) {
    tag = document.createElement('meta');
    Object.entries(createAttributes).forEach(([key, value]) => tag?.setAttribute(key, value));
    document.head.append(tag);
  }

  tag.setAttribute('content', content);
}

function upsertCanonical(href: string) {
  let tag = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (!tag) {
    tag = document.createElement('link');
    tag.setAttribute('rel', 'canonical');
    document.head.append(tag);
  }

  tag.setAttribute('href', href);
}

function applyRouteSeo(route: SeoRoute) {
  const url = absoluteSiteUrl(route.path);
  const image = absoluteSiteUrl(route.image);

  document.title = route.title;
  upsertCanonical(url);
  upsertMeta('meta[name="description"]', { name: 'description' }, route.description);
  upsertMeta('meta[property="og:url"]', { property: 'og:url' }, url);
  upsertMeta('meta[property="og:title"]', { property: 'og:title' }, route.title);
  upsertMeta('meta[property="og:description"]', { property: 'og:description' }, route.description);
  upsertMeta('meta[property="og:image"]', { property: 'og:image' }, image);
  upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title' }, route.title);
  upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description' }, route.description);
  upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image' }, image);
}

function routeSeo(isPolicyRoute: boolean, isGeneratorRoute: boolean) {
  if (isPolicyRoute) return POLICY_SEO;
  if (isGeneratorRoute) return GENERATOR_SEO;
  return HOME_SEO;
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
    applyRouteSeo(routeSeo(isPolicyRoute, isGeneratorRoute));
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
