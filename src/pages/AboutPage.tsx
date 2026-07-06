import { JSX, useState } from 'react';

import tauriConf from '../../src-tauri/tauri.conf.json';
import { Tabs, TabsType } from '../components/Tabs';
import { LEGAL_DOCS, LegalDocId, getAcceptedDate } from '../util/legal';
import styles from './AboutPage.module.css';

const WEBSITE_URL = 'https://dmx-controller.app';
const GITHUB_URL = 'https://github.com/wmmiii/dmx-controller-app/';
const ISSUES_URL = 'https://github.com/wmmiii/dmx-controller-app/issues';
const LICENSE_URL =
  'https://github.com/wmmiii/dmx-controller-app/blob/main/LICENSE';
const SUPPORT_EMAIL = 'support@dmx-controller.app';

export function AboutPage(): JSX.Element {
  const [tab, setTab] = useState('app');

  const tabs: TabsType = {
    app: {
      name: 'App',
      contents: <AppTab />,
    },
    terms: {
      name: LEGAL_DOCS.terms.title,
      contents: <LegalTab doc="terms" />,
    },
    privacy: {
      name: LEGAL_DOCS.privacy.title,
      contents: <LegalTab doc="privacy" />,
    },
  };

  return (
    <Tabs
      className={styles.wrapper}
      selectedTab={tab}
      setSelectedTab={setTab}
      tabs={tabs}
    />
  );
}

function AppTab(): JSX.Element {
  return (
    <div className={styles.tab}>
      <h1>DMX Controller App</h1>
      <dl className={styles.meta}>
        <dt>Version</dt>
        <dd>{tauriConf.version}</dd>
        <dt>Website</dt>
        <dd>
          <a href={WEBSITE_URL} target="_blank" rel="noreferrer">
            {WEBSITE_URL}
          </a>
        </dd>
        <dt>GitHub</dt>
        <dd>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            {GITHUB_URL}
          </a>
        </dd>
        <dt>Report a bug</dt>
        <dd>
          <a href={ISSUES_URL} target="_blank" rel="noreferrer">
            {ISSUES_URL}
          </a>
        </dd>
        <dt>Support</dt>
        <dd>
          <a href={`mailto:${SUPPORT_EMAIL}`} target="_blank" rel="noreferrer">
            {SUPPORT_EMAIL}
          </a>
        </dd>
        <dt>License</dt>
        <dd>
          <a href={LICENSE_URL} target="_blank" rel="noreferrer">
            Apache License 2.0
          </a>
        </dd>
        <dt>Copyright</dt>
        <dd>© 2026 William Martin III</dd>
      </dl>
    </div>
  );
}

function LegalTab({ doc }: { doc: LegalDocId }): JSX.Element {
  const { title, version, content } = LEGAL_DOCS[doc];
  const acceptedIso = getAcceptedDate(doc);
  const accepted = acceptedIso
    ? `Accepted on ${new Date(acceptedIso).toLocaleString()}`
    : 'Not yet accepted';

  return (
    <div className={styles.tab}>
      <div className={styles.legal}>
        <div className={styles.acceptance}>
          <span>{accepted}</span>
          <span className={styles.version}>
            {title} v{version}
          </span>
        </div>
        <div
          className={styles.doc}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </div>
    </div>
  );
}
