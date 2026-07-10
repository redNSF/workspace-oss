import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { CLOUDINARY_FOLDER } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

function signCloudinary(params: Record<string, string>, apiSecret: string): string {
  const paramString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(paramString + apiSecret).digest("hex");
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: canUpload, error: permissionError } = await supabase.rpc(
    "user_has_permission",
    {
      p_user_id: user.id,
      p_permission: "create_items",
    },
  );

  if (permissionError || !canUpload) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return Response.json(
      {
        error:
          "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
      },
      { status: 500 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "Only image files are allowed" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return Response.json({ error: "File size exceeds the 5 MB limit" }, { status: 400 });
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const folder = CLOUDINARY_FOLDER;
  const paramsToSign: Record<string, string> = { folder, timestamp };
  const signature = signCloudinary(paramsToSign, apiSecret);

  const uploadForm = new FormData();
  uploadForm.append("file", file);
  uploadForm.append("api_key", apiKey);
  uploadForm.append("timestamp", timestamp);
  uploadForm.append("signature", signature);
  uploadForm.append("folder", folder);

  const cloudinaryRes = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: "POST", body: uploadForm },
  );

  if (!cloudinaryRes.ok) {
    const detail = await cloudinaryRes.text();
    console.error("Cloudinary upload error:", detail);
    let errorMessage = "Failed to upload to Cloudinary";
    try {
      const parsed = JSON.parse(detail);
      if (parsed.error?.message) {
        errorMessage = `Cloudinary error: ${parsed.error.message}`;
      }
    } catch {
      // Keep the generic upstream error.
    }
    return Response.json({ error: errorMessage }, { status: 502 });
  }

  const result = (await cloudinaryRes.json()) as {
    secure_url: string;
    public_id: string;
  };
  return Response.json({ url: result.secure_url, public_id: result.public_id });
}
