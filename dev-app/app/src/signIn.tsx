import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';

/**
 * Guest sign-in, taken automatically.
 *
 * Colophon's authorizer runs on real credentials — it resolves the caller,
 * then asks the catalog whether they may see the entity a bundle is linked
 * to. Disabling auth outright would skip that path entirely and leave the
 * harness unable to see the difference between "allowed" and "never checked".
 * A guest identity is a real one, so the check still runs.
 */
export const signInModule = createFrontendModule({
  pluginId: 'app',
  extensions: [
    SignInPageBlueprint.make({
      params: {
        loader: async () => {
          const { SignInPage } = await import('@backstage/core-components');
          return props => <SignInPage {...props} auto providers={['guest']} />;
        },
      },
    }),
  ],
});
