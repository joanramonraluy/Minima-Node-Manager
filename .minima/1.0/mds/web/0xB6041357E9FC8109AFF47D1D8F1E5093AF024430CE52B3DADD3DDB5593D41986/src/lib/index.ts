export function promisify(fn: any, command: string, arg: any = undefined, raw = false): any {
  return new Promise((resolve) => {
    if (arg) {
      fn(command, arg, function (response: any) {
        if (raw) {
          return resolve(response);
        }

        if (response.status) {
          return resolve(response.response);
        }

        return resolve(null);
      });
    } else {
      fn(command, function (response: any) {
        if (raw) {
          return resolve(response);
        }

        if (response.status) {
          return resolve(response.response);
        }

        return resolve(null);
      });
    }
  });
}

export function set(key: string, value: string) {
  return promisify(MDS.keypair.set, key, value, true);
}

export function get(key: string) {
  return promisify(MDS.keypair.get, key, undefined, true);
}

export function deleteFile(fileName: string) {
  return promisify((window as any).MDS.file.delete, fileName);
}

export function loadFile(fileName: string) {
  return promisify((window as any).MDS.file.load, fileName);
}

export function saveFile(fileName: string, arg: string | object) {
  return promisify((window as any).MDS.file.save, fileName, arg);
}
