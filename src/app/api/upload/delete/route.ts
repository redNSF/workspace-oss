import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function signCloudinary(params: Record<string, string>, apiSecret: string): string {
  const paramString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(paramString + apiSecret).digest("hex");
}

export async function DELETE(request: NextRequest) {
  const sessionClient = await createClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return Response.json({ error: "Cloudinary is not configured." }, { status: 500 });
  }

  let body: { public_id?: string };
  try {
    body = await request.json() as { public_id?: string };
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { public_id } = body;
  if (!public_id) {
    return Response.json({ error: "public_id is required" }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { data: photo, error: photoError } = await adminClient
    .from("item_photos")
    .select("uploaded_by")
    .eq("public_id", public_id)
    .maybeSingle();

  if (photoError || !photo || photo.uploaded_by !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const paramsToSign: Record<string, string> = { public_id, timestamp };
  const signature = signCloudinary(paramsToSign, apiSecret);

  const deleteForm = new FormData();
  deleteForm.append("public_id", public_id);
  deleteForm.append("api_key", apiKey);
  deleteForm.append("timestamp", timestamp);
  deleteForm.append("signature", signature);

  const cloudinaryRes = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
    { method: "POST", body: deleteForm }
  );

  if (!cloudinaryRes.ok) {
    const detail = await cloudinaryRes.text();
    console.error("Cloudinary delete error:", detail);
    let errorMessage = "Failed to delete from Cloudinary";
    try {
      const parsed = JSON.parse(detail);
      if (parsed.error && parsed.error.message) {
        errorMessage = `Cloudinary error: ${parsed.error.message}`;
      }
    } catch {}
    return Response.json({ error: errorMessage }, { status: 502 });
  }

  const { error: deleteError } = await adminClient
    .from("item_photos")
    .delete()
    .eq("public_id", public_id)
    .eq("uploaded_by", user.id);

  if (deleteError) {
    console.error("Photo metadata delete error:", deleteError);
    return Response.json(
      { error: "Image was removed but its metadata could not be deleted" },
      { status: 500 },
    );
  }

  return Response.json({ ok: true });
}
