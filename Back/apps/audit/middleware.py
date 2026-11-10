from contextvars import ContextVar


_current_request = ContextVar('audit_current_request', default=None)


class AuditRequestContextMiddleware:
    """
    Guarda a request atual em contexto local para eventos de auditoria.
    As views ainda registram explicitamente os eventos sensiveis.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = _current_request.set(request)
        try:
            return self.get_response(request)
        finally:
            _current_request.reset(token)


def get_current_request():
    return _current_request.get()
