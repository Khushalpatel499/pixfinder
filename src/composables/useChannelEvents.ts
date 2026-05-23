/**
 * Manages binding/unbinding events on a channel in a trackable way.
 * Prevents memory leaks by tracking all bindings for clean teardown.
 */
export function useChannelEvents() {
  const bindings: { event: string; handler: (...args: any[]) => void }[] = [];
  let boundChannel: any = null;

  const bind = (channel: any, event: string, handler: (...args: any[]) => void) => {
    channel.bind(event, handler);
    bindings.push({ event, handler });
  };

  const unbindAll = () => {
    if (!boundChannel) return;
    bindings.forEach(({ event, handler }) => {
      boundChannel.unbind(event, handler);
    });
    bindings.length = 0;
    boundChannel = null;
  };

  const setChannel = (channel: any) => {
    if (boundChannel && boundChannel !== channel) {
      unbindAll();
    }
    boundChannel = channel;
  };

  const getChannel = () => boundChannel;

  return { bind, unbindAll, setChannel, getChannel };
}
