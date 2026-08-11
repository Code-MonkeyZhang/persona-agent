import Layout from '../components/Layout';

const EFFECTIVE_DATE = 'August 11, 2026';

export default function Privacy() {
  return (
    <Layout>
      <article className="container-prose py-20">
        <div className="prose-policy">
          <p className="text-xs font-medium uppercase tracking-widest text-ink-faint">
            Privacy Policy
          </p>
          <h1 className="mt-3">Persona Mobile Privacy Policy</h1>
          <p className="mt-3 text-sm text-ink-faint">
            Effective Date: {EFFECTIVE_DATE}
          </p>

          <h2>Summary</h2>
          <p>
            We do not collect, transmit, or share any personal data from Persona Mobile. All chat
            content, voice narration, and the device name you assign flow only between your iPhone
            and the Persona Agent desktop server that you operate yourself. We never see any of it.
          </p>

          <h2>Data You Control</h2>
          <p>
            Persona Mobile is a remote client. It connects to a Persona Agent server that you run
            on your own computer (macOS or Windows) through a Cloudflare Tunnel URL that you
            provide. The following information flows only between your phone and your own server:
          </p>
          <ul>
            <li>
              <strong>Chat messages.</strong> Everything you type and every reply you receive is
              sent directly to and from your own server. The developer has no access.
            </li>
            <li>
              <strong>Agent configuration.</strong> The list of agents, their system prompts,
              bound MCP servers, and Skills are pulled from your own desktop server when you
              connect.
            </li>
            <li>
              <strong>Device name.</strong> Used only to identify which device a session is running
              on. Cached locally on your phone and sent to your own server. Never sent anywhere
              else.
            </li>
          </ul>

          <h2>Data Stored Locally on Your Device</h2>
          <p>
            Persona Mobile stores connection preferences, recent server URL, and cached agent
            information on your phone using on-device storage. This data never leaves your device
            except when sent to your own server as described above. Uninstalling the app removes all
            of it.
          </p>

          <h2>Third-Party Libraries</h2>
          <p>
            Persona Mobile uses the following open-source React Native libraries. None of them
            collect data on our behalf.
          </p>
          <ul>
            <li>
              <code>react-native-mmkv</code> — local on-device key/value storage. No network
              access.
            </li>
            <li>
              <code>react-native-device-info</code> — reads the device name. The value is cached
              locally and sent only to your own Persona Agent server.
            </li>
            <li>
              <code>react-native-track-player</code> — plays text-to-speech audio returned by your
              own server. No third-party analytics.
            </li>
            <li>
              <code>react-native-camera-kit</code> — used for QR code scanning if you choose to
              pair devices by code. Camera input is processed on-device and not stored.
            </li>
          </ul>
          <p>
            The app does not include any advertising SDKs, analytics SDKs, crash reporting SDKs, or
            tracking SDKs. There are no IDFA accesses, no attribution integrations, and no third
            parties receiving data from this app.
          </p>

          <h2>Children's Privacy</h2>
          <p>
            Persona Mobile is not directed at children under the age of 13. We do not knowingly
            collect personal information from anyone, including children. Because the app collects
            no data whatsoever, no parental consent or verifiable age-gate is required. If you
            believe a child has provided information to us through the app, please contact us and we
            will clarify that no such information is retained.
          </p>

          <h2>Network Security</h2>
          <p>
            All connections to your Persona Agent server use HTTPS via Cloudflare Tunnel. App
            Transport Security (ATS) allows arbitrary loads because the user-supplied tunnel URL
            cannot be enumerated in advance — this permission exists exclusively to support the
            core feature of connecting to a user-operated server.
          </p>

          <h2>Changes to This Policy</h2>
          <p>
            If we change what data Persona Mobile handles, we will update this page and revise the
            Effective Date at the top. We will not retroactively weaken protections for data that
            was handled under a stricter policy.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about this policy can be sent to{' '}
            <a href="mailto:yufengzhang483@gmail.com">yufengzhang483@gmail.com</a>. The source code
            for both Persona Mobile and the Persona Agent desktop app is available at{' '}
            <a
              href="https://github.com/Code-MonkeyZhang/persona-agent-mobile"
              target="_blank"
              rel="noreferrer"
            >
              github.com/Code-MonkeyZhang/persona-agent-mobile
            </a>{' '}
            and{' '}
            <a
              href="https://github.com/Code-MonkeyZhang/persona-agent"
              target="_blank"
              rel="noreferrer"
            >
              github.com/Code-MonkeyZhang/persona-agent
            </a>
            .
          </p>
        </div>
      </article>
    </Layout>
  );
}
