import { BadRequestException, Injectable } from '@nestjs/common';
import { Provider } from '@prisma/client';
import { SocialProvider } from './provider.types';
import { LinkedInProvider } from './providers/linkedin';
import { FacebookProvider, InstagramProvider } from './providers/meta';
import { XProvider } from './providers/x';
import { YouTubeProvider } from './providers/youtube';
import { ThreadsProvider } from './providers/threads';
import { TikTokProvider } from './providers/tiktok';
import { PinterestProvider } from './providers/pinterest';

@Injectable()
export class ProviderRegistry {
  private readonly providers = new Map<Provider, SocialProvider>(
    [new FacebookProvider(), new InstagramProvider(), new XProvider(), new LinkedInProvider(), new YouTubeProvider(), new ThreadsProvider(), new TikTokProvider(), new PinterestProvider()].map(
      (p) => [p.key, p],
    ),
  );

  get(key: Provider | string): SocialProvider {
    const provider = this.providers.get(String(key).toUpperCase() as Provider);
    if (!provider) throw new BadRequestException(`Unsupported provider: ${key}`);
    return provider;
  }

  all(): SocialProvider[] {
    return [...this.providers.values()];
  }
}
