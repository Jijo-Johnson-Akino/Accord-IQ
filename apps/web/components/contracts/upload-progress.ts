export async function postFormWithProgress(
  url: string,
  form: FormData,
  idempotencyKey: string,
  onProgress: (percent: number) => void,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Idempotency-Key", idempotencyKey);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(xhr.responseText) as Record<string, unknown>;
      } catch {
        body = { error: "The server returned an unreadable response." };
      }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => reject(new Error("The upload could not be completed."));
    xhr.send(form);
  });
}
