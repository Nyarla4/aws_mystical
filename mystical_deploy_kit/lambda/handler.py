import json, os, re, subprocess, tempfile, uuid
import boto3

RESULT_BUCKET = os.environ["RESULT_BUCKET"]
GS_BIN        = "/opt/bin/gs"
GS_FLAGS      = ["-q", "-dNOSAFER", "-dBATCH", "-dNOPAUSE", "-sDEVICE=pngalpha", "-r150"]
PS_LIB_DIR    = os.path.join(os.path.dirname(__file__), "ps_lib")


def _is_mystical(code):
    return "(mystical.ps) run" in code


def _build_normal_ps(code):
    if not _is_mystical(code):
        return code
    code = re.sub(r"\(mystical\.ps\) run", "% (mystical.ps) run", code)
    code = re.sub(r"^(\s*)\{",  r"\1% {",  code, flags=re.MULTILINE)
    code = re.sub(r"\}\s*mystical", "% } mystical", code)
    return code


def _build_magic_ps(code):
    if _is_mystical(code):
        return code
    body = re.sub(
        r"^(\s*)%(?!!)\s*(.*)", r"(\2) /mystical_comment_flag pop pop",
        code, flags=re.MULTILINE,
    )
    return (
        f"%!PS\n({PS_LIB_DIR}/mystical.ps) run\n"
        "72 dup scale\n4.25 5.5 translate\n4 dup scale\n{\n"
        + body +
        "\n} mystical\n\nshowpage\n"
    )


def handler(event, context):
    try:
        body = event.get("body") or "{}"
        if isinstance(body, str):
            try:    body = json.loads(body)
            except: body = {"code": body, "mode": "magic"}

        ps_code = (body.get("code") or "").strip()
        mode    = body.get("mode", "magic")

        if not ps_code:
            return _r(400, {"error": "code is required"})

        final_ps = _build_normal_ps(ps_code) if mode == "normal" else _build_magic_ps(ps_code)
        job_id   = str(uuid.uuid4())

        with tempfile.TemporaryDirectory() as tmp:
            ps_path, png_path = f"{tmp}/{job_id}.ps", f"{tmp}/{job_id}.png"
            with open(ps_path, "w") as f:
                f.write(final_ps)
            res = subprocess.run(
                [GS_BIN, *GS_FLAGS, f"-sOutputFile={png_path}", ps_path],
                capture_output=True, text=True, timeout=25,
            )
            if res.returncode != 0:
                return _r(500, {"error": "ghostscript failed", "detail": res.stderr[-800:]})
            s3  = boto3.client("s3")
            key = f"output/{job_id}.png"
            s3.upload_file(png_path, RESULT_BUCKET, key, ExtraArgs={"ContentType": "image/png"})

        url = s3.generate_presigned_url(
            "get_object", Params={"Bucket": RESULT_BUCKET, "Key": key}, ExpiresIn=3600,
        )
        return _r(200, {"url": url})

    except subprocess.TimeoutExpired:
        return _r(504, {"error": "rendering timeout"})
    except Exception as e:
        return _r(500, {"error": str(e)})


def _r(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
        },
        "body": json.dumps(body, ensure_ascii=False),
    }
