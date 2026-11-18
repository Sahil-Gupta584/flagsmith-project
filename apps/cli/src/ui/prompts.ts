import * as p from '@clack/prompts';

    export async function promptApplyConfirmation(): Promise<boolean> {
      const confirmed = await p.confirm({
        message: 'Apply these changes to Flagsmith?',
        initialValue: true,
      });

        if (p.isCancel(confirmed)) {
          return false;
        }

        return confirmed;
      }
