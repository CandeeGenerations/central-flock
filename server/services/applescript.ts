import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export type ServiceType = 'iMessage' | 'SMS';

export async function sendMessage(
  phoneNumber: string,
  message: string,
  serviceType: ServiceType = 'iMessage'
): Promise<void> {
  const escapedMessage = message
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "'\\''");
  const escapedPhone = phoneNumber.replace(/"/g, '');

  const script = `
    tell application "Messages"
      set targetService to 1st account whose service type = ${serviceType}
      set targetBuddy to participant "${escapedPhone}" of targetService
      send "${escapedMessage}" to targetBuddy
    end tell
  `;

  try {
    await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
  } catch (error) {
    throw new Error(
      `Failed to send message to ${phoneNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function createContact(
  firstName: string,
  lastName: string,
  phoneNumber: string
): Promise<void> {
  const escapedFirst = firstName.replace(/"/g, '\\"').replace(/'/g, "'\\''");
  const escapedLast = lastName.replace(/"/g, '\\"').replace(/'/g, "'\\''");
  const escapedPhone = phoneNumber.replace(/"/g, '');

  const script = `
    tell application "Contacts"
      set newPerson to make new person with properties {first name:"${escapedFirst}", last name:"${escapedLast}"}
      make new phone at end of phones of newPerson with properties {label:"mobile", value:"${escapedPhone}"}
      save
    end tell
  `;

  try {
    await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
  } catch (error) {
    throw new Error(
      `Failed to create contact for ${firstName} ${lastName}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
