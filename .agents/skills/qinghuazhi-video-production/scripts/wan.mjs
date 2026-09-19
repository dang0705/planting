import './env.mjs';
import {
  execFileSync
} from 'node:child_process';
import {
  readFile,
  writeFile,
  stat
} from 'node:fs/promises';
import {
  extname
} from 'node:path';
import {
  buildWan27Request
} from './wan-adapter-27.mjs';
import {
  buildLegacyWanRequest
} from './wan-adapter-legacy.mjs';

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp'
};

export class WanFreeQuotaExhaustedError
  extends Error {
  constructor({
    model,
    providerCode,
    message,
    status = 403
  }) {
    super(
      `Wan 免费额度耗尽：${model} / ${providerCode} / ${message ?? ''}`
    );

    this.name =
      'WanFreeQuotaExhaustedError';

    this.code =
      'WAN_FREE_QUOTA_EXHAUSTED';

    this.model =
      model;

    this.providerCode =
      providerCode;

    this.status =
      status;
  }
}

export function isWanFreeQuotaExhaustedError(
  error
) {
  return (
    error?.code ===
    'WAN_FREE_QUOTA_EXHAUSTED'
  );
}

function upload(
  model,
  path
) {
  const result =
    execFileSync(
      'dashscope',
      [
        'oss.upload',
        '--model',
        model,
        '--file',
        path
      ],
      {
        encoding: 'utf8'
      }
    );

  const match =
    result.match(
      /Uploaded oss url:\s*(oss:\/\/\S+)/
    );

  if (!match) {
    throw new Error(
      `百炼临时上传失败：\n${result}`
    );
  }

  return match[1];
}

function requestForAdapter({
  profile,
  imageUrl,
  audioUrl,
  prompt,
  negativePrompt,
  seed,
  duration,
  resolution
}) {
  if (
    profile.adapter ===
    'wan27-media'
  ) {
    return buildWan27Request({
      imageUrl,
      audioUrl,
      prompt,
      negativePrompt,
      seed,
      duration,
      resolution
    });
  }

  if (
    profile.adapter ===
    'wan-legacy'
  ) {
    return buildLegacyWanRequest({
      profile,
      imageUrl,
      audioUrl,
      prompt,
      negativePrompt,
      seed,
      duration,
      resolution
    });
  }

  throw new Error(
    `未知 Wan adapter：${profile.adapter}`
  );
}

function quotaGuard({
  profile,
  status,
  payload,
  quotaCodes
}) {
  const providerCode =
    payload?.code ??
    payload?.output?.code ??
    null;

  if (
    status === 403 &&
    quotaCodes.includes(
      providerCode
    )
  ) {
    throw new WanFreeQuotaExhaustedError({
      model:
        profile.model,
      providerCode,
      message:
        payload?.message ??
        payload?.output?.message ??
        '',
      status
    });
  }
}

export async function generateWanI2V({
  profile,
  imagePath,
  prompt,
  negativePrompt = '',
  seed = null,
  duration,
  resolution,
  output,
  drivingAudioPath = null,
  quotaExhaustedCodes = [
    'AllocationQuota.FreeTierOnly'
  ]
}) {
  if (!profile?.model) {
    throw new Error(
      'generateWanI2V 缺少 profile'
    );
  }

  const apiKey =
    process.env.DASHSCOPE_API_KEY;

  const workspaceId =
    process.env.DASHSCOPE_WORKSPACE_ID;

  if (!apiKey || !workspaceId) {
    throw new Error(
      '缺少百炼 API Key / Workspace ID'
    );
  }

  const ext =
    extname(
      imagePath
    ).toLowerCase();

  const mime =
    MIME[ext];

  if (!mime) {
    throw new Error(
      `Wan 不支持图片格式：${ext}`
    );
  }

  const st =
    await stat(imagePath);

  if (
    st.size >
    20 * 1024 * 1024
  ) {
    throw new Error(
      'Wan 输入图片超过 20MB'
    );
  }

  const image =
    await readFile(
      imagePath
    );

  const imageUrl =
    `data:${mime};base64,` +
    image.toString('base64');

  const audioUrl =
    drivingAudioPath
      ? upload(
          profile.model,
          drivingAudioPath
        )
      : null;

  const adapter =
    requestForAdapter({
      profile,
      imageUrl,
      audioUrl,
      prompt,
      negativePrompt,
      seed,
      duration,
      resolution
    });

  const baseUrl =
    `https://${workspaceId}` +
    `.cn-beijing.maas.aliyuncs.com/api/v1`;

  const headers = {
    Authorization:
      `Bearer ${apiKey}`,
    'Content-Type':
      'application/json',
    'X-DashScope-Async':
      'enable'
  };

  if (
    adapter.usesOssResource
  ) {
    headers[
      'X-DashScope-OssResourceResolve'
    ] = 'enable';
  }

  const create =
    await fetch(
      `${baseUrl}/services/aigc/video-generation/video-synthesis`,
      {
        method: 'POST',
        headers,
        body:
          JSON.stringify({
            model:
              profile.model,
            input:
              adapter.input,
            parameters:
              adapter.parameters
          })
      }
    );

  const created =
    await create.json();

  if (!create.ok) {
    quotaGuard({
      profile,
      status:
        create.status,
      payload:
        created,
      quotaCodes:
        quotaExhaustedCodes
    });

    throw new Error(
      `Wan 创建失败：${create.status}\n` +
      JSON.stringify(
        created,
        null,
        2
      )
    );
  }

  const taskId =
    created.output?.task_id;

  if (!taskId) {
    throw new Error(
      'Wan 未返回 task_id'
    );
  }

  for (
    let i = 0;
    i < 60;
    i++
  ) {
    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          15000
        )
    );

    const response =
      await fetch(
        `${baseUrl}/tasks/${taskId}`,
        {
          headers: {
            Authorization:
              `Bearer ${apiKey}`
          }
        }
      );

    const result =
      await response.json();

    if (!response.ok) {
      quotaGuard({
        profile,
        status:
          response.status,
        payload:
          result,
        quotaCodes:
          quotaExhaustedCodes
      });

      throw new Error(
        `Wan 查询失败：${response.status}`
      );
    }

    if (
      result.output?.task_status ===
      'FAILED'
    ) {
      const providerCode =
        result.output?.code ??
        result.code ??
        null;

      if (
        quotaExhaustedCodes.includes(
          providerCode
        )
      ) {
        throw new WanFreeQuotaExhaustedError({
          model:
            profile.model,
          providerCode,
          message:
            result.output?.message ??
            result.message ??
            ''
        });
      }

      throw new Error(
        `Wan 失败：` +
        JSON.stringify(
          result.output,
          null,
          2
        )
      );
    }

    if (
      result.output?.task_status ===
      'SUCCEEDED'
    ) {
      const url =
        result.output?.video_url;

      const download =
        await fetch(url);

      if (!download.ok) {
        throw new Error(
          `Wan 下载失败：${download.status}`
        );
      }

      await writeFile(
        output,
        Buffer.from(
          await download.arrayBuffer()
        )
      );

      const usageSec =
        Number(
          result.usage?.duration ??
          result.usage
            ?.output_video_duration ??
          duration
        );

      return {
        model:
          profile.model,
        adapter:
          profile.adapter,
        adapterVersion:
          profile.adapterVersion,
        taskId,
        requestId:
          result.request_id ??
          created.request_id ??
          null,
        usageSec,
        usage:
          result.usage ?? null
      };
    }
  }

  throw new Error(
    'Wan 等待超时'
  );
}
