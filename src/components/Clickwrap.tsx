import { JSX, useState } from 'react';

import {
  LEGAL_DOCS,
  LegalDocId,
  acceptDocument,
  hasAcceptedBefore,
  isAccepted,
} from '../util/legal';
import { Button } from './Button';
import styles from './Clickwrap.module.css';

interface ClickwrapProps {
  children: React.ReactNode;
}

export function Clickwrap({ children }: ClickwrapProps): JSX.Element {
  const [tosAccepted, setTosAccepted] = useState(() => isAccepted('terms'));
  const [ppAccepted, setPpAccepted] = useState(() => isAccepted('privacy'));
  // A returning user has accepted something before; new users see first-run copy.
  const [returning] = useState(hasAcceptedBefore);

  if (tosAccepted && ppAccepted) {
    return <>{children}</>;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h1>
          {returning
            ? 'One quick thing...'
            : 'Get ready to bring up the lights'}
        </h1>
        <p>
          {returning
            ? 'We’ve updated our legal documents. Please take a look and accept the latest versions to keep going.'
            : 'Before we get started, please review and accept the Terms of Service and Privacy Policy.'}
        </p>
      </div>
      {!tosAccepted && (
        <AcceptStep
          doc="terms"
          onAccept={() => {
            acceptDocument('terms');
            setTosAccepted(true);
          }}
        />
      )}
      {!ppAccepted && tosAccepted && (
        <AcceptStep
          doc="privacy"
          onAccept={() => {
            acceptDocument('privacy');
            setPpAccepted(true);
          }}
        />
      )}
    </div>
  );
}

interface AcceptStepProps {
  doc: LegalDocId;
  onAccept: () => void;
}

function AcceptStep({ doc, onAccept }: AcceptStepProps): JSX.Element {
  const { title, content } = LEGAL_DOCS[doc];
  return (
    <div className={styles.scrollable}>
      <div
        className={styles.doc}
        dangerouslySetInnerHTML={{ __html: content }}
      />
      <div className={styles.footer}>
        <span className={styles.agreement}>
          By continuing you agree to the {title}.
        </span>
        <Button variant="primary" onClick={onAccept}>
          I Agree
        </Button>
      </div>
    </div>
  );
}
